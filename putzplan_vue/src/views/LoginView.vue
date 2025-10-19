<script setup lang="ts">
import {useAuthStore} from "@/stores/authStore"
import {useHouseholdStore} from "@/stores/householdStore"
import { ref } from "vue"
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const router = useRouter()
const email = ref('')
const password = ref('')

const handleLogin = async () => {
    const result = await authStore.login(email.value, password.value)
    if (result.success) {
        // Load household after successful login (prevents race condition with router guard)
        await householdStore.loadUserHousehold()
        router.push('/')
    }
}
</script>

<template>
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h2 class="card-title text-center">Login</h2>
              <form @submit.prevent="handleLogin">
                email:
                <input type="email" v-model="email" required/>
                passwort:
                <input type="password" v-model="password" required/>
                <button type="submit" >Login</button>
              </form>

              <!-- Navigation zu Register Page -->
              <!-- router-link erstellt automatisch <a> tag mit korrekter href -->
              <!-- Vue Router navigiert client-side ohne Page Reload -->
              <p class="text-center mt-3">
                Noch kein Account?
                <router-link to="/register" class="btn btn-link p-0">
                  Hier registrieren
                </router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>