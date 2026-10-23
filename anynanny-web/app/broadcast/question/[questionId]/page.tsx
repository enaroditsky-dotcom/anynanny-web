import { BroadcastQuestionAnswer } from "@/components/broadcast/broadcast-question-answer";

export const dynamic = "force-dynamic";

export default async function BroadcastQuestionPage({
  params
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = await params;
  return <BroadcastQuestionAnswer questionId={questionId} />;
}
