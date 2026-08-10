import { useRef, type ComponentProps, type ReactNode } from "react";
import type { User } from "@animateicons/react/lucide";
import { Button } from "./Button";

type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type AnimatedIconButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  children: ReactNode;
  icon: typeof User;
  iconPosition?: "start" | "end";
  iconSize?: number;
};

export function AnimatedIconButton({
  children,
  icon: Icon,
  iconPosition = "start",
  iconSize = 20,
  ...buttonProps
}: AnimatedIconButtonProps) {
  const iconRef = useRef<AnimatedIconHandle>(null);

  return (
    <Button
      {...buttonProps}
      onMouseEnter={(event) => {
        buttonProps.onMouseEnter?.(event);
        iconRef.current?.startAnimation();
      }}
      onMouseLeave={(event) => {
        buttonProps.onMouseLeave?.(event);
        iconRef.current?.stopAnimation();
      }}
    >
      {iconPosition === "start" && <Icon ref={iconRef} size={iconSize} />}
      {children}
      {iconPosition === "end" && <Icon ref={iconRef} size={iconSize} />}
    </Button>
  );
}
