import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function MetricTile({
  title,
  value,
  detail,
  progress
}: {
  title: string;
  value: string;
  detail: string;
  progress?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-2xl font-semibold tracking-normal">{value}</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {typeof progress === "number" ? <Progress value={progress} /> : null}
      </CardContent>
    </Card>
  );
}
