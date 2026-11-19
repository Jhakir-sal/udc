import logoHorizontal from "@assets/logo-horizontal.png";
import logoHorizontalWhite from "@assets/logo-horizontal-white.png";
import { cn } from "@/lib/utils";

export function ThemeLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src={logoHorizontal}
        alt="Steps After Life"
        className={cn(className, "dark:hidden")}
      />
      <img
        src={logoHorizontalWhite}
        alt="Steps After Life"
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}