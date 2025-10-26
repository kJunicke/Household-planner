<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Pie, Bar } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale } from 'chart.js'
import { useHouseholdStore } from '../stores/householdStore'
import { useTaskStore } from '../stores/taskStore'

ChartJS.register(Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale)

const householdStore = useHouseholdStore()
const taskStore = useTaskStore()

type TimePeriod = 'all' | 'week' | 'month' | 'year'
const selectedPeriod = ref<TimePeriod>('all')

interface CompletionWithDetails {
  completion_id: string
  completed_at: string
  user_id: string
  task_id: string
  effort_override: number | null
  override_reason: string | null
  tasks: {
    title: string
  }
  household_members: {
    display_name: string
  }
}

const allCompletions = ref<CompletionWithDetails[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    const data = await taskStore.fetchCompletions()
    console.log('Stats View - Loaded completions:', data)
    allCompletions.value = data as CompletionWithDetails[]
  } catch (error) {
    console.error('Error loading completions:', error)
  } finally {
    isLoading.value = false
  }
})

// Filtere Completions nach Zeitraum
const filteredCompletions = computed(() => {
  const now = new Date()
  const completions = allCompletions.value

  if (selectedPeriod.value === 'all') {
    return completions
  }

  const cutoffDate = new Date()
  if (selectedPeriod.value === 'week') {
    cutoffDate.setDate(now.getDate() - 7)
  } else if (selectedPeriod.value === 'month') {
    cutoffDate.setMonth(now.getMonth() - 1)
  } else if (selectedPeriod.value === 'year') {
    cutoffDate.setFullYear(now.getFullYear() - 1)
  }

  return completions.filter(c => new Date(c.completed_at) >= cutoffDate)
})

// Helper: Convert hex to rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return `rgba(79, 70, 229, ${alpha})` // Fallback to primary color
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
}

// Berechne Effort pro User basierend auf gefilterten Completions
const effortByUser = computed(() => {
  const completions = filteredCompletions.value
  const members = householdStore.householdMembers

  if (!completions.length || !members.length) {
    return null
  }

  // Mappe user_id zu effort_total
  const effortMap = new Map<string, number>()

  completions.forEach(completion => {
    const task = taskStore.tasks.find(t => t.task_id === completion.task_id)
    // Priorisiere effort_override (Mehraufwand), sonst Standard-Effort
    const effort = completion.effort_override ?? task?.effort ?? 1

    const currentEffort = effortMap.get(completion.user_id) || 0
    effortMap.set(completion.user_id, currentEffort + effort)
  })

  return effortMap
})

// Pie Chart Data
const pieChartData = computed(() => {
  const effortMap = effortByUser.value
  const members = householdStore.householdMembers

  if (!effortMap) {
    return null
  }

  // Erstelle Labels und Data Arrays
  const labels: string[] = []
  const data: number[] = []
  const backgroundColors: string[] = []
  const borderColors: string[] = []

  members.forEach((member) => {
    const effort = effortMap.get(member.user_id) || 0
    labels.push(member.display_name || 'Unbekannt')
    data.push(effort)
    backgroundColors.push(hexToRgba(member.user_color, 0.9))
    borderColors.push(member.user_color)
  })

  return {
    labels,
    datasets: [{
      label: 'Aufwand (gewichtet)',
      data,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 2,
      hoverOffset: 8
    }]
  }
})

// Bar Chart Data
const barChartData = computed(() => {
  const effortMap = effortByUser.value
  const members = householdStore.householdMembers

  if (!effortMap) {
    return null
  }

  // Erstelle Labels und Data Arrays
  const labels: string[] = []
  const data: number[] = []
  const backgroundColors: string[] = []
  const borderColors: string[] = []

  members.forEach((member) => {
    const effort = effortMap.get(member.user_id) || 0
    labels.push(member.display_name || 'Unbekannt')
    data.push(effort)
    backgroundColors.push(hexToRgba(member.user_color, 0.85))
    borderColors.push(member.user_color)
  })

  return {
    labels,
    datasets: [{
      label: 'Punkte',
      data,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 2,
      borderRadius: 8
    }]
  }
})

const pieChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 16,
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 13,
          weight: 500 as const
        },
        color: '#1e293b',
        usePointStyle: true,
        pointStyle: 'circle'
      }
    },
    title: {
      display: true,
      text: 'Aufgabenverteilung',
      font: {
        family: 'Inter, system-ui, sans-serif',
        size: 16,
        weight: 600 as const
      },
      color: '#1e293b',
      padding: {
        bottom: 20
      }
    },
    tooltip: {
      backgroundColor: '#1e293b',
      padding: 12,
      cornerRadius: 8,
      titleFont: {
        family: 'Inter, system-ui, sans-serif',
        size: 13,
        weight: 600 as const
      },
      bodyFont: {
        family: 'Inter, system-ui, sans-serif',
        size: 13
      },
      callbacks: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: function(context: any) {
          const label = context.label || ''
          const value = context.parsed || 0
          const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
          const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
          return ` ${label}: ${value} Punkte (${percentage}%)`
        }
      }
    }
  }
}

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    title: {
      display: true,
      text: 'Punkteverteilung',
      font: {
        family: 'Inter, system-ui, sans-serif',
        size: 16,
        weight: 600 as const
      },
      color: '#1e293b',
      padding: {
        bottom: 20
      }
    },
    tooltip: {
      backgroundColor: '#1e293b',
      padding: 12,
      cornerRadius: 8,
      titleFont: {
        family: 'Inter, system-ui, sans-serif',
        size: 13,
        weight: 600 as const
      },
      bodyFont: {
        family: 'Inter, system-ui, sans-serif',
        size: 13
      },
      callbacks: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: function(context: any) {
          const label = context.label || ''
          const value = context.parsed.y || 0
          return ` ${label}: ${value} Punkte`
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 13,
          weight: 500 as const
        },
        color: '#64748b'
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: '#e2e8f0',
        lineWidth: 1
      },
      border: {
        display: false
      },
      ticks: {
        stepSize: 1,
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 12
        },
        color: '#64748b',
        padding: 8
      }
    }
  }
}
</script>

<template>
  <div class="stats-view">
    <div class="container mt-4">
      <h2 class="page-title mb-4">Statistiken</h2>

      <!-- Zeitraum-Tabs -->
      <div class="time-period-tabs mb-4">
        <button
          @click="selectedPeriod = 'all'"
          :class="['btn', 'btn-sm', selectedPeriod === 'all' ? 'btn-primary' : 'btn-outline-primary']"
        >
          Gesamt
        </button>
        <button
          @click="selectedPeriod = 'week'"
          :class="['btn', 'btn-sm', selectedPeriod === 'week' ? 'btn-primary' : 'btn-outline-primary']"
        >
          Woche
        </button>
        <button
          @click="selectedPeriod = 'month'"
          :class="['btn', 'btn-sm', selectedPeriod === 'month' ? 'btn-primary' : 'btn-outline-primary']"
        >
          Monat
        </button>
        <button
          @click="selectedPeriod = 'year'"
          :class="['btn', 'btn-sm', selectedPeriod === 'year' ? 'btn-primary' : 'btn-outline-primary']"
        >
          Jahr
        </button>
      </div>

      <div class="row g-4">
        <!-- Bar Chart - Punkteverteilung -->
        <div class="col-12 col-lg-6">
          <div class="card shadow-sm">
            <div class="card-body p-4">
              <div v-if="barChartData" class="chart-container">
                <Bar :data="barChartData" :options="barChartOptions" />
              </div>
              <div v-else class="text-center text-muted py-5">
                <i class="bi bi-bar-chart fs-1 d-block mb-3"></i>
                <p>Noch keine Daten verfügbar</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Pie Chart - Aufgabenverteilung -->
        <div class="col-12 col-lg-6">
          <div class="card shadow-sm">
            <div class="card-body p-4">
              <div v-if="pieChartData" class="chart-container">
                <Pie :data="pieChartData" :options="pieChartOptions" />
              </div>
              <div v-else class="text-center text-muted py-5">
                <i class="bi bi-pie-chart fs-1 d-block mb-3"></i>
                <p>Noch keine Daten verfügbar</p>
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
  padding: 2rem 0;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.time-period-tabs {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 1rem;
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.chart-container {
  position: relative;
  height: 420px;
  padding: 1.5rem;
}

/* Card Styling für Charts */
.card {
  transition: all var(--transition-base);
  border: 1px solid var(--color-border);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-border-hover);
}

.card-body {
  padding: 1rem;
}
</style>
