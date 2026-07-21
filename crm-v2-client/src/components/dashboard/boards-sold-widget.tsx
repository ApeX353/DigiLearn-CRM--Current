import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
// import { Monitor } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useBoardsSold } from "~/api/dashboard";

interface BoardsSoldWidgetProps {
  filters: DashboardFilters;
}

export function BoardsSoldWidget({ filters }: BoardsSoldWidgetProps) {
  const { data: boardsSoldData, isLoading } = useBoardsSold(filters);
  const data = boardsSoldData?.data;

  
  // const sizeEntries = Object.entries(data.bySize).sort(
  //   ([a], [b]) => parseInt(a) - parseInt(b)
  // );

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

  if (!data) return null;

  return null;

  // return (
  //   <Card>
  //     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
  //       <CardTitle className="text-sm font-medium">Boards Sold</CardTitle>
  //       <Monitor className="h-4 w-4 text-muted-foreground" />
  //     </CardHeader>
  //     <CardContent>
  //       <div className="text-2xl font-bold">{data.total}</div>
  //       <p className="text-xs text-muted-foreground mt-1">
  //         Total units sold
  //       </p>
  //       <div className="mt-4 space-y-2">
  //         <p className="text-xs font-medium mb-2">By Size</p>
  //         {sizeEntries.map(([size, count]) => (
  //           <div key={size} className="flex items-center justify-between text-xs">
  //             <span className="text-muted-foreground">{size}" Display</span>
  //             <span className="font-medium">{count} units</span>
  //           </div>
  //         ))}
  //         {data.byRep.length > 0 && (
  //           <>
  //             <p className="text-xs font-medium mt-3 mb-2">Top Performer</p>
  //             <div className="flex items-center justify-between text-xs">
  //               <span className="text-muted-foreground">
  //                 {data.byRep[0].repName}
  //               </span>
  //               <span className="font-medium text-green-600">
  //                 {data.byRep[0].count} units
  //               </span>
  //             </div>
  //           </>
  //         )}
  //       </div>
  //     </CardContent>
  //   </Card>
  // );
}
