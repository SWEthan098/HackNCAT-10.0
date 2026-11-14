// OWNER: Jordan (P4). One icon per listener, so a glance tells them apart in feeds and findings.

import { IconKey, IconMail, IconShield } from "@/components/ui";
import type { Sensor } from "@/lib/types/kairos";

const ICONS: Record<Sensor, typeof IconKey> = {
  login_guard: IconKey,
  comms_guard: IconMail,
  agent_firewall: IconShield,
};

/** Decorative: always sits next to the listener's name. */
export function SensorIcon({ sensor, size = 16, className }: { sensor: Sensor; size?: number; className?: string }) {
  const Icon = ICONS[sensor];
  return Icon ? <Icon size={size} className={className} /> : null;
}
