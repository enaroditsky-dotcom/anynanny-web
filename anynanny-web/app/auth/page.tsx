"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    // מעביר אוטומטית למסך הבית הראשי
    router.replace("/");
  }, [router]);

  return null;
}