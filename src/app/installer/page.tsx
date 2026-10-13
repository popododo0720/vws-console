import type { Metadata } from "next";
import { InstallerWizard } from "@/components/sites/installer/installer-wizard";

export const metadata: Metadata = { title: "Installer · VWS" };

export default function Page() {
  return <InstallerWizard />;
}
