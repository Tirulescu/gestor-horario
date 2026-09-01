import SubjectDetailClient from "./SubjectDetailClient";

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubjectDetailClient id={Number(id)} />;
}