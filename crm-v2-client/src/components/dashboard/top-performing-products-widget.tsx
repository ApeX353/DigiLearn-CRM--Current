import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useTopPerformingProducts } from "~/api/dashboard";

interface TopPerformingProductsWidgetProps {
  filters: DashboardFilters;
}

export function TopPerformingProductsWidget({
  filters,
}: TopPerformingProductsWidgetProps) {
  const { data: productsData, isLoading } = useTopPerformingProducts(filters);
  const data = productsData?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.products || data.products.length === 0) return null;

  // Get the top product
  const topProduct = data.products[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Top Performing Products
        </CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{topProduct.product_name}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {topProduct.totalCount} units sold • R{topProduct.totalAmount.toLocaleString()}
        </p>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium mb-2">All Products</p>
          {data.products.map((product) => (
            <div
              key={product.product_id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted-foreground truncate max-w-[180px]">
                {product.product_name}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{product.totalCount} units</span>
                <span className="text-muted-foreground">
                  R{(product.totalAmount / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          ))}
          {topProduct.byRep.length > 0 && (
            <>
              <p className="text-xs font-medium mt-3 mb-2">Top Performer</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {topProduct.byRep[0].name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-green-600">
                    {topProduct.byRep[0].count} units
                  </span>
                  <span className="text-muted-foreground">
                    R{(topProduct.byRep[0].value / 1000).toFixed(0)}k
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
