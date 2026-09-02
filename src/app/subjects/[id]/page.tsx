import SubjectDetailPageClient from "./SubjectDetailPageClient";

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubjectDetailPageClient id={Number(id)} />;
}
