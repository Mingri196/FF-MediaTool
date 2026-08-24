import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** 文件选择行（输入/输出通用）：Label + 路径输入 + 浏览按钮 */
export function FileRow({
  label,
  value,
  placeholder,
  onBrowse,
  onChange,
  readOnly,
  browseTitle,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onBrowse: () => void;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  browseTitle?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn("flex-1 font-mono text-xs", readOnly && "cursor-pointer")}
          onClick={readOnly ? onBrowse : undefined}
        />
        <Button variant="outline" size="icon" title={browseTitle ?? label} onClick={onBrowse}>
          <FolderOpen className="size-4" />
        </Button>
      </div>
    </div>
  );
}