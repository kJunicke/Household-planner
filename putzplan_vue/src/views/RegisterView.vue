<script setup lang="ts">
import {useAuthStore} from "@/stores/authStore"
import { ref } from "vue"

const authStore = useAuthStore()
const email = ref('')
const password = ref('')

const handleRegister = () => {
    authStore.register(email.value, password.value)
}
</script>

<template>
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h2 class="card-title text-center">Registrierung</h2>
              <form @submit.prevent="handleRegister">
                email:
                <input type="email" v-model="email" required/>
                passwort:
                <input type="password" v-model="password" required/>
                <button type="submit" >Registrieren</button>
              </form>

              <!-- Navigation zu Login Page -->
              <!-- to="/login" - Vue Router navigiert zu der Route mit name: 'login' -->
              <!-- client-side navigation - kein Server Request, instant -->
              <p class="text-center mt-3">
                Schon einen Account?
                <router-link to="/login" class="btn btn-link p-0">
                  Hier anmelden
                </router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>