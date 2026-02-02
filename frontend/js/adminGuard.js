import { supabase } from "./supabaseClient.js";

async function protectAdmin() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        window.location.href = "/pages/admin-login.html";
        return;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile.role !== "admin") {
        alert("Unauthorized access");
        window.location.href = "/";
    }
}

protectAdmin();
