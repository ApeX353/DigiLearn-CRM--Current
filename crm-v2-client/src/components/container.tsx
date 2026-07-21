import { cn } from "~/lib/utils";

const Container = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <section className={cn("container mx-auto", className)}>{children}</section>
  );
};

export default Container;
