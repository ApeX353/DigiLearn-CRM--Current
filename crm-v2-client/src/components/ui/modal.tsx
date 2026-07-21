import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "lg" | "md" | "sm" | "full";
}

const Modal = ({
  title,
  description,
  children,
  isOpen,
  onClose,
  size="sm"
}: ModalProps) => {
  const contentWidth = useMemo(() => {
    switch (size) {
      case "full":
        return "max-w-full";
      case "lg":
        return "max-w-6xl";
      case "md":
        return "max-w-4xl";
      case "sm":
        return "max-w-xl";
      default:
        return "";
    }
  }, [size]);

  const handleChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleChange}>
      <DialogContent
        className={cn("overflow-y-auto max-h-[96dvh]", contentWidth)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
