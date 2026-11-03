import { Suspense } from "react";
import ChallengeRoom from "@/components/ChallengeRoom";

// The game code comes from the link (/c/ABCD), so it's read at request time
async function Room({ params }: { params: PageProps<"/c/[code]">["params"] }) {
  const { code } = await params;
  return <ChallengeRoom code={code.toUpperCase()} />;
}

export default function ChallengePage({ params }: PageProps<"/c/[code]">) {
  return (
    <Suspense fallback={null}>
      <Room params={params} />
    </Suspense>
  );
}
