"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type UsernameState = { error: string | null };

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export async function setUsername(
  _previous: UsernameState,
  formData: FormData,
): Promise<UsernameState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error: "3–20 characters. Letters, numbers and underscores only.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please log in again." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is taken. Try another." };
    }
    return { error: "Could not save your username. Try again." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
