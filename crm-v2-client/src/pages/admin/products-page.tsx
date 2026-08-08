import { useState } from "react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Package, MoreHorizontal, Pencil, Power } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import {
  useProducts,
  useToggleProductActive,
  type Product,
} from "~/api/products";
import { AddProductDialog } from "~/components/products/add-product-dialog";
import { EditProductDialog } from "~/components/products/edit-product-dialog";
import { useCurrency } from "~/hooks/use-currency";

const categoryColors: Record<string, string> = {
  Board: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Tablet: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Laptop: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  LMS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  STEM: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  VR: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  Bundle: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Service: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  Software: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

export default function ProductsPage() {
  const { data, isLoading } = useProducts({ page: 1, limit: 100 });
  const { formatCurrency } = useCurrency();
  const toggleActive = useToggleProductActive();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const products = data?.data || [];

  const handleToggleActive = async (product: Product) => {
    try {
      await toggleActive.mutateAsync({
        id: product.id,
        is_active: !product.is_active,
      });
      toast.success(
        `Product ${product.is_active ? "deactivated" : "activated"}`,
      );
    } catch {
      toast.error("Failed to update product status");
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Manage product catalog"
        actions={<AddProductDialog />}
      />

      <Container className="p-4">
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Product Catalog ({products.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No products found. Create your first product to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow
                        key={product.id}
                        className={!product.is_active ? "opacity-60" : ""}
                      >
                        <TableCell className="max-w-md">
                          <div className="font-medium">
                            {product.name}
                            {product.sku && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
                                {product.sku}
                              </span>
                            )}
                          </div>
                          {product.description ? (
                            <div
                              className="line-clamp-2 text-sm text-muted-foreground"
                              title={product.description}
                            >
                              {product.description}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground capitalize">
                              {product.unit}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {product.product_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge
                              className={
                                categoryColors[product.category] || ""
                              }
                            >
                              {product.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(product.price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.discount > 0
                            ? `${product.discount}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.tax > 0 ? `${product.tax}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              product.is_active ? "default" : "secondary"
                            }
                          >
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditingProduct(product)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(product)}
                              >
                                <Power className="mr-2 h-4 w-4" />
                                {product.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </Container>

      <EditProductDialog
        product={editingProduct}
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
      />
    </div>
  );
}
