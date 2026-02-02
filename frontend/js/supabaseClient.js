import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
    "https://bmvwpfuxajvurcoalblh.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdndwZnV4YWp2dXJjb2FsYmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NDczNzgsImV4cCI6MjA4NDMyMzM3OH0.GxG2AVt5qUhzPPFJV7MZH3kTmN_gIx6lqhTQfbkP7SQ"
);
