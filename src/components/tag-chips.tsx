import { Badge } from "@/components/ui/badge";

// Tags are a flat list of opaque strings (rule #13/#14) — no key/value, no
// normalized Tag entity.
export function TagChips({ tags }: { tags: string[] | null }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
