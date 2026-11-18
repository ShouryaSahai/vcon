"use client";

import React from "react";

export default function AppPageTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="vcon-page-enter">{children}</div>;
}