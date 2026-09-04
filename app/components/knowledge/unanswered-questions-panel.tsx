import { PaginationControls } from "../ui/pagination-controls";

export type UnansweredQuestion = {
  id: string;
  question: string;
  createdAt: string | Date;
};

export type UnansweredQuestionsPanelProps = {
  questions: UnansweredQuestion[];
  isConverting: boolean;
  onConvert: (question: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function UnansweredQuestionsPanel({
  questions,
  isConverting,
  onConvert,
  page,
  pageCount,
  onPageChange,
}: UnansweredQuestionsPanelProps) {
  return (
    <s-section heading="Top unanswered questions">
      {questions.length === 0 ? (
        <s-paragraph tone="neutral" color="subdued">
          No unanswered questions yet. When a shopper asks something your
          FAQ doesn&rsquo;t cover, it will show up here.
        </s-paragraph>
      ) : (
        <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-300">
          {questions.map((entry) => (
            <s-stack
              key={entry.id}
              direction="inline"
              gap="base"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text>{entry.question}</s-text>
              <s-button
                variant="tertiary"
                {...(isConverting ? { loading: true } : {})}
                onClick={() => onConvert(entry.question)}
              >
                Convert to FAQ
              </s-button>
            </s-stack>
          ))}
        </s-stack>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          onPageChange={onPageChange}
        />
        </s-stack>
      )}
    </s-section>
  );
}
