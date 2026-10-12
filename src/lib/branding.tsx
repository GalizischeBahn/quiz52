import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Branding = {
  system_name: string;
  logo_url: string | null;
  color_background: string;
  color_surface: string;
  color_surface_2: string;
  color_foreground: string;
  color_accent: string;
};

export const DEFAULT_BRANDING: Branding = {
  system_name: "КВІЗ 52",
  logo_url: null,
  color_background: "220 12% 5%",
  color_surface: "220 10% 9%",
  color_surface_2: "220 8% 13%",
  color_foreground: "40 20% 92%",
  color_accent: "38 78% 55%",
};

export function useBranding() {
  const query = useQuery({
    queryKey: ["app-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<Branding> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "system_name, logo_url, color_background, color_surface, color_surface_2, color_foreground, color_accent",
        )
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { ...DEFAULT_BRANDING, ...(data ?? {}) } as Branding;
    },
  });
  return query.data ?? DEFAULT_BRANDING;
}

export function brandingCss(b: Branding) {
  return `:root{--background:hsl(${b.color_background});--surface:hsl(${b.color_surface});--surface-2:hsl(${b.color_surface_2});--foreground:hsl(${b.color_foreground});--accent:hsl(${b.color_accent});--accent-soft:hsl(${b.color_accent} / 0.14);}`;
}

/** Injects the admin-configured palette as CSS variables. */
export function BrandingStyle() {
  const branding = useBranding();
  return <style dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />;
}

/** Logo + system name lockup used across participant and admin headers. */
export function BrandMark({ className = "" }: { className?: string }) {
  const branding = useBranding();
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt={branding.system_name}
          className="size-7 rounded object-contain"
        />
      ) : (
        <div className="grid size-7 place-items-center bg-accent font-display text-sm font-bold text-accent-foreground">
          {branding.system_name.trim().charAt(0).toUpperCase() || "К"}
        </div>
      )}
      <span className="font-display font-semibold tracking-tight">{branding.system_name}</span>
    </div>
  );
}
