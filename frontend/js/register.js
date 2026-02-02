import { supabase } from "./supabaseClient.js";

const form = document.getElementById("registerForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = form.full_name.value;
    const email = form.email.value;
    const password = form.password.value;
    const phone = form.phone.value;
    const pcn = form.pcn_number.value;
    const dob = form.dob.value;
    const wedding = form.wedding_anniversary.value;

    // 1. Create Auth User
    const { data: authData, error: authError } =
        await supabase.auth.signUp({
            email,
            password
        });

    if (authError) {
        alert(authError.message);
        return;
    }

    // 2. Create Profile (Pending)
    const { error: profileError } = await supabase
        .from("profiles")
        .insert({
            id: authData.user.id,
            full_name,
            email,
            phone,
            pcn_number: pcn,
            dob,
            wedding_anniversary: wedding,
            role: "user",
            status: "pending"
        });

    if (profileError) {
        alert(profileError.message);
        return;
    }

    // 3. Redirect
    window.location.href = "/pages/pending.html";
});
