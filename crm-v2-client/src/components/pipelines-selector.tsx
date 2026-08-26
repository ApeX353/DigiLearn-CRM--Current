import { useEffect } from "react";
import { usePipelines } from "~/api/pipelines";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";

interface PipelinesSelectorProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

const PipelinesSelector = ({ value, onValueChange }: PipelinesSelectorProps) => {
  const { data, isLoading } = usePipelines({ page: 1, limit: 50 });
  const pipelines = data?.data || [];

  useEffect(() => {
    if (!value && pipelines.length > 0 && onValueChange) {
      const defaultPipeline =
        pipelines.find((p) => p.is_default) || pipelines[0];
      if (defaultPipeline) {
        onValueChange(defaultPipeline.id);
      }
    }
  }, [pipelines, value, onValueChange]);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select pipeline" />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((pipeline) => (
          <SelectItem key={pipeline.id} value={pipeline.id}>
            <div className="flex items-center gap-2">
              <span>{pipeline.name}</span>
              {pipeline.is_default && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  Default
                </Badge>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default PipelinesSelector;
