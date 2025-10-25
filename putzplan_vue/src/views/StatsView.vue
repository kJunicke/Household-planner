<script setup lang="ts">
import { computed } from 'vue'
import { Pie } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement } from 'chart.js'
import { useHouseholdStore } from '../stores/householdStore'
import { useTaskStore } from '../stores/taskStore'
import Header from '../components/Header.vue'

ChartJS.register(Title, Tooltip, Legend, ArcElement)

const householdStore = useHouseholdStore()
const taskStore = useTaskStore()

// Berechne gewichtete Prozentverteilung basierend auf effort
const chartData = computed(() => {
  const completions = taskStore.completions
  const members = householdStore.householdMembers

  if (!completions.length || !members.length) {
    return null
  }

  // Mappe user_id zu effort_total
  const effortByUser = new Map<string, number>()

  completions.forEach(completion => {
    const task = taskStore.tasks.find(t => t.task_id === completion.task_id)
    const effort = task?.effort || 1 // Fallback zu 1 wenn task nicht gefunden

    const currentEffort = effortByUser.get(completion.user_id) || 0
    effortByUser.set(completion.user_id, currentEffort + effort)
  })

  // Erstelle Labels und Data Arrays
  const labels: string[] = []
  const data: number[] = []
  const backgroundColors: string[] = []

  // Farben für die Segmente
  const colors = [
    'rgb(255, 99, 132)',
    'rgb(54, 162, 235)',
    'rgb(255, 205, 86)',
    'rgb(75, 192, 192)',
    'rgb(153, 102, 255)',
    'rgb(255, 159, 64)',
    'rgb(201, 203, 207)'
  ]

  members.forEach((member, index) => {
    const effort = effortByUser.get(member.user_id) || 0
    labels.push(member.display_name || 'Unbekannt')
    data.push(effort)
    backgroundColors.push(colors[index % colors.length])
  })

  return {
    labels,
    datasets: [{
      label: 'Aufwand (gewichtet)',
      data,
      backgroundColor: backgroundColors,
      hoverOffset: 4
    }]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      position: 'bottom' as const
    },
    title: {
      display: true,
      text: 'Aufgabenverteilung (gewichtet nach Aufwand)'
    },
    tooltip: {
      callbacks: {
        label: function(context: any) {
          const label = context.label || ''
          const value = context.parsed || 0
          const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
          const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
          return `${label}: ${value} Punkte (${percentage}%)`
        }
      }
    }
  }
}
</script>

<template>
  <div class="stats-view">
    <Header />
    <div class="container mt-4">
      <div class="row">
        <div class="col-12 col-lg-8 offset-lg-2">
          <div class="card shadow-sm">
            <div class="card-body p-4">
              <div v-if="chartData" class="chart-container">
                <Pie :data="chartData" :options="chartOptions" />
              </div>
              <div v-else class="text-center text-muted py-5">
                <i class="bi bi-pie-chart fs-1 d-block mb-3"></i>
                <p>Noch keine Daten verfügbar. Erledigt ein paar Aufgaben um die Statistik zu sehen!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-view {
  min-height: 100vh;
  background: var(--color-background);
}

.chart-container {
  max-width: 600px;
  margin: 0 auto;
}
</style>
