import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button, buttonVariants } from "./ui/button";
import { type VariantProps } from "class-variance-authority";

interface ConfirmDialogProps {
  btnText: React.ReactNode;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isProcessing?: boolean;
  //variant?: "default" | "destructive" | "outline";
  className?: string;
  hasError?: boolean;
}

export function ConfirmDialog({
  btnText,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isProcessing = false,
  variant = "destructive",
  hasError = false,
  ...btnProps
}: ConfirmDialogProps & VariantProps<typeof buttonVariants>) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const onClose = () => {
    setIsConfirmOpen(false);
  };

  return (
    <div>
      <Button
        variant={variant}
        onClick={() => setIsConfirmOpen(true)}
        {...btnProps}
        disabled={isProcessing || hasError}
      >
        {btnText}
      </Button>

      <AlertDialog
        open={isConfirmOpen}
        onOpenChange={(open) => !open && onClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing} onClick={onClose}>
              {cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={isProcessing}
              className={
                variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {isProcessing ? "Processing..." : confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
