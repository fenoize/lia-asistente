import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AssistantConfig = {
  name: string;
  gender: "feminine" | "masculine";
};

const DEFAULT: AssistantConfig = { name: "Lia", gender: "feminine" };

export function useAssistant(): AssistantConfig {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AssistantConfig>(DEFAULT);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("assistant_name, assistant_gender")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setCfg({
        name: (data as any).assistant_name || "Lia",
        gender: ((data as any).assistant_gender === "masculine" ? "masculine" : "feminine"),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return cfg;
}
