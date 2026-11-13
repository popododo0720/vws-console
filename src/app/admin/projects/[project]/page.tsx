import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminProjectDetailView } from "@/components/sites/console/admin-project-detail-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { getAdminProject } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Project details · VWS" };

export default async function Page({ params }: { params: Promise<{ project: string }> }) {
  const { project: id } = await params;
  await connection();
  const project = await getAdminProject(id);
  if (!project.ok && project.error.code === "PermissionDenied") {
    return <AdminAccessDenied error={project.error} page="Projects" />;
  }
  return (
    <AdminProjectDetailView
      id={id}
      project={project.ok ? project.value : null}
      loadError={project.ok ? null : project.error}
    />
  );
}
