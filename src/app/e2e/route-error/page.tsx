import { connection } from "next/server";
import { notFound } from "next/navigation";

export default async function RouteErrorFixture() {
  await connection();
  if (process.env.VWS_E2E !== "1") notFound();
  throw Object.assign(new Error("e2e fixture failure"), { code: "E2EFixtureError" });
}
