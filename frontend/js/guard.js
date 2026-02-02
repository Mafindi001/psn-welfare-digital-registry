import { supabase } from "./supabaseClient.js";

const protectDashboard = async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
        window.location.href = "/pages/login.html";
        return;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("status, role")
        .eq("id", data.user.id)
        .single();

    if (profile.status !== "approved") {
        window.location.href = "/pages/pending.html";
    }
};

protectDashboard();
