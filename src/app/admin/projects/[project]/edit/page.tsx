import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminProjectFormView } from "@/components/sites/console/admin-project-form-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { getAdminProject, listAdminRegions } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Edit project · VWS" };

export default async function Page({ params }: { params: Promise<{ project: string }> }) {
  const { project: id } = await params;
  await connection();
  const [project, regions] = await Promise.all([getAdminProject(id), listAdminRegions()]);
  if (!project.ok && project.error.code === "PermissionDenied") {
    return <AdminAccessDenied error={project.error} page="Projects" />;
  }
  const missing = { code: "NotFound", message: `${id} has no project mapping.`, requestId: null };
  const loadError = !project.ok ? project.error : !regions.ok ? regions.error : project.value ? null : missing;
  return (
    <AdminProjectFormView
      id={id}
      project={project.ok ? project.value : null}
      regions={regions.ok ? regions.value.map((region) => region.name) : []}
      loadError={loadError}
    />
  );
}
