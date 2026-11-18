import React, { Suspense } from "react";

export default function AppPageTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="vcon-page-enter">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}