type VideoTimestampFieldsProps = {
  start: string;
  end: string;
  onChange: (next: { start?: string; end?: string }) => void;
};

// Lets a merchant mark the slice of an attached how-to video that actually
// answers the question ("roof assembly is at 0:10–0:15"). The assistant
// mentions the range in its reply and the player opens at the start time.
export function VideoTimestampFields({
  start,
  end,
  onChange,
}: VideoTimestampFieldsProps) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-text color="subdued">
        Show only part of this video (optional)
      </s-text>
      <s-stack direction="inline" gap="small-200">
        <s-text-field
          label="Starts at"
          value={start}
          placeholder="0:10"
          details="Seconds or mm:ss"
          onChange={(event: Event) =>
            onChange({ start: (event.currentTarget as HTMLInputElement).value })
          }
        />
        <s-text-field
          label="Ends at"
          value={end}
          placeholder="0:15"
          details="Leave blank to play to the end"
          onChange={(event: Event) =>
            onChange({ end: (event.currentTarget as HTMLInputElement).value })
          }
        />
      </s-stack>
    </s-stack>
  );
}
