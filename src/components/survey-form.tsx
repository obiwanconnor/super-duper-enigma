import { RATINGS, ratingLabels, type Rating } from "@/lib/survey";
import { SubmitButton } from "./submit-button";

/**
 * Good / Okay / Poor as native radio buttons (keyboard and screen-reader
 * friendly by default), plus an optional comment.
 */
export function SurveyForm({
  action,
  hidden,
  legend,
  selected,
  comment,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  legend: string;
  selected?: Rating | null;
  comment?: string | null;
}) {
  return (
    <form action={action} className="space-y-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <fieldset>
        <legend className="label">{legend}</legend>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold">
              <input type="radio" name="rating" value={r} required defaultChecked={selected === r} />
              {ratingLabels[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="survey-comment" className="label">
          Anything you&apos;d like to add? (optional)
        </label>
        <textarea id="survey-comment" name="comment" rows={3} maxLength={2000} defaultValue={comment ?? ""} className="input" />
      </div>
      <SubmitButton pendingText="Sending…">Send feedback</SubmitButton>
    </form>
  );
}
