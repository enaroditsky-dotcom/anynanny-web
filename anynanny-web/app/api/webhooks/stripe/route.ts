import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getStripe } from "@/lib/stripe/server";
import { createClient } from '@supabase/supabase-js';

const stripe = getStripe();
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature')!;
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body, 
      signature, 
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    
    // כאן התיקון: אנחנו מחפשים booking_id כפי שמופיע ב-Metadata ב-Stripe
    const bookingId = session.metadata?.booking_id;

    console.log('--- Webhook Debug ---');
    console.log('Booking ID found:', bookingId);

    if (!bookingId) {
      console.error('Error: booking_id not found in metadata!');
      return new NextResponse('Missing booking_id', { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('bookings')
      .update({ 
        payment_status: 'paid', 
        paid_at: new Date().toISOString() 
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Supabase DB Update Error:', error);
      return new NextResponse('DB Update failed', { status: 500 });
    }

    console.log('Successfully updated booking:', bookingId);
  }

  return new NextResponse(null, { status: 200 });
}