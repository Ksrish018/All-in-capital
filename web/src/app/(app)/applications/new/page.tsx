import { Uploader } from "./uploader";

export default function NewApplicationsPage() {
  return (
    <div className="rise mx-auto max-w-[1100px]">
      <div className="eyebrow">All In Capital · Intake</div>
      <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[60px]">
        Add <em className="text-accent">applications</em>
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] text-muted">
        Drop any number of form and deck PDFs. They are paired by company name and join the queue straight away. Nothing is
        lost: each one keeps its place in line until it is screened.
      </p>
      <div className="hairline mt-6" />
      <Uploader />
    </div>
  );
}
