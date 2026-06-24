import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    // שליפה ישירה באמצעות המשתנים של שכבת השרת
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        status: "error", 
        message: "Missing server environment variables in .env.local" 
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ניסיון שליפת נתונים קצר מטבלת bookings
    const { data, error } = await supabase
      .from("bookings")
      .select("id, status")
      .limit(1);

    if (error) {
      return NextResponse.json({ 
        status: "error", 
        message: "Database connection failed", 
        error: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      status: "success", 
      message: "Server connected to DB perfectly!", 
      previewData: data 
    });

  } catch (error: any) {
    return NextResponse.json({ status: "exception", error: error.message }, { status: 500 });
  }
}