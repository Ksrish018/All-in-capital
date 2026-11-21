import { BriefView } from "./brief";

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  return <BriefView id={id} />;
}
