import { useState, useEffect } from "react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useProducts } from "~/api/products";
import { cn } from "~/lib/utils";

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: string[];
  onSave: (productIds: string[]) => void;
}

export function ProductSelectionModal({
  isOpen,
  onClose,
  selectedProducts,
  onSave,
}: ProductSelectionModalProps) {
  const [selected, setSelected] = useState<string[]>(selectedProducts);
  const { data: productsData, isLoading } = useProducts({
    is_active: true,
    limit: 100,
    page: 1
  });
  const products = productsData?.data || [];

  useEffect(() => {
    setSelected(selectedProducts);
  }, [selectedProducts, isOpen]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Products" size="sm">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {products.map((product) => {
              const isSelected = selected.includes(product.id);
              return (
                <Badge
                  key={product.id}
                  variant={isSelected ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer text-sm py-1.5 px-3",
                    isSelected && "bg-primary text-primary-foreground",
                  )}
                  onClick={() => toggle(product.id)}
                >
                  {product.name}
                </Badge>
              );
            })}
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active products found.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(selected);
                onClose();
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
