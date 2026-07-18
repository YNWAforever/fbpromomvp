import { notFound } from "next/navigation";
import AlphaLifecycleClient from "./alpha-lifecycle-client";
import { isTestRuntime } from "@/testing/test-runtime";

export default function AlphaTestPage() {
  if (!isTestRuntime()) notFound();
  return <AlphaLifecycleClient />;
}
