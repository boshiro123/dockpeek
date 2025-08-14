document.addEventListener("DOMContentLoaded", () => {
  let allContainersData = []
  let allServersData = []
  let filteredAndSortedContainers = []
  let currentSortColumn = "name"
  let currentSortDirection = "asc"
  let currentServerFilter = "all"
  let groupByProject = true
  const collapsedGroups = new Set()

  const searchInput = document.getElementById("search-input")
  const containerRowsBody = document.getElementById("container-rows")
  const body = document.body
  const rowTemplate = document.getElementById("container-row-template")
  const serverFilterContainer = document.getElementById(
    "server-filter-container"
  )
  const mainTable = document.getElementById("main-table")
  const refreshButton = document.getElementById("refresh-button")

  function showLoadingIndicator() {
    refreshButton.classList.add("loading")
    containerRowsBody.innerHTML = `<tr><td colspan="5"><div class="loader"></div></td></tr>`
  }

  function hideLoadingIndicator() {
    refreshButton.classList.remove("loading")
  }

  function displayError(message) {
    hideLoadingIndicator()
    const colspan = mainTable.classList.contains("table-single-server") ? 5 : 6
    containerRowsBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-8 text-red-500">${message}</td></tr>`
  }

  function renderTable() {
    containerRowsBody.innerHTML = ""

    const pageItems = filteredAndSortedContainers

    if (pageItems.length === 0) {
      const colspan = mainTable.classList.contains("table-single-server")
        ? 5
        : 6
      if (searchInput.value || currentServerFilter !== "all") {
        containerRowsBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-8 text-gray-500">No containers found matching your criteria.</td></tr>`
      } else {
        containerRowsBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-8 text-gray-500">No containers to display.</td></tr>`
      }
      return
    }

    const fragment = document.createDocumentFragment()

    if (groupByProject) {
      const groups = new Map()
      for (const c of pageItems) {
        const project = c.compose_project || "Ungrouped"
        const key = `${c.server}::${project}`
        if (!groups.has(key))
          groups.set(key, { project, server: c.server, items: [] })
        groups.get(key).items.push(c)
      }

      const totalColumns = mainTable.classList.contains("table-single-server")
        ? 5
        : 6

      for (const [key, group] of groups) {
        const headerRow = document.createElement("tr")
        headerRow.className = "group-header"
        const td = document.createElement("td")
        td.colSpan = totalColumns
        td.className = "py-2 px-4 text-gray-700 font-semibold cursor-pointer"
        const isCollapsed = collapsedGroups.has(key)
        td.innerHTML = `${isCollapsed ? "📁" : "📂"} ${
          group.project
        } <span class="text-sm text-gray-400">(${group.server})</span>`
        headerRow.addEventListener("click", () => {
          if (collapsedGroups.has(key)) collapsedGroups.delete(key)
          else collapsedGroups.add(key)
          renderTable()
        })
        headerRow.appendChild(td)
        fragment.appendChild(headerRow)

        if (isCollapsed) continue

        for (const c of group.items) {
          const clone = rowTemplate.content.cloneNode(true)
          clone.querySelector('[data-content="name"]').textContent = c.name
          clone.querySelector('[data-content="server"]').textContent = c.server
          clone.querySelector('[data-content="image"]').textContent = c.image
          const statusCell = clone.querySelector('[data-content="status"]')
          statusCell.textContent = c.status
          statusCell.className = `py-3 px-4 border-b border-gray-200 table-cell-status ${
            c.status === "running" ? "status-running" : "status-exited"
          }`
          const portsCell = clone.querySelector('[data-content="ports"]')
          if (c.ports.length > 0) {
            portsCell.innerHTML = c.ports
              .map(
                p =>
                  `<a href="${p.link}" target="_blank" class="badge text-bg-dark me-1 rounded">${p.host_port}</a> <small class="text-secondary">→ ${p.container_port}</small>`
              )
              .join("<br>")
          } else {
            portsCell.innerHTML = `<span class="status-none" style="padding-left: 15px;">none</span>`
          }
          const row = clone.querySelector("tr")
          row.dataset.status = c.status
          row.dataset.containerName = c.name
          row.dataset.serverName = c.server
          const actionButtons = clone.querySelectorAll(".action-btn")
          actionButtons.forEach(button => {
            if (button.classList.contains("logs-btn")) {
              button.addEventListener("click", () =>
                openLogsModal(c.server, c.name)
              )
              return
            }
            button.addEventListener("click", handleContainerAction)
            const action = button.dataset.action
            if (
              (action === "start" && c.status === "running") ||
              (action === "stop" && c.status === "exited")
            ) {
              button.disabled = true
            }
          })
          fragment.appendChild(clone)
        }
      }
    } else {
      for (const c of pageItems) {
        const clone = rowTemplate.content.cloneNode(true)
        clone.querySelector('[data-content="name"]').textContent = c.name
        clone.querySelector('[data-content="server"]').textContent = c.server
        clone.querySelector('[data-content="image"]').textContent = c.image
        const statusCell = clone.querySelector('[data-content="status"]')
        statusCell.textContent = c.status
        statusCell.className = `py-3 px-4 border-b border-gray-200 table-cell-status ${
          c.status === "running" ? "status-running" : "status-exited"
        }`
        const portsCell = clone.querySelector('[data-content="ports"]')
        if (c.ports.length > 0) {
          portsCell.innerHTML = c.ports
            .map(
              p =>
                `<a href="${p.link}" target="_blank" class="badge text-bg-dark me-1 rounded">${p.host_port}</a> <small class="text-secondary">→ ${p.container_port}</small>`
            )
            .join("<br>")
        } else {
          portsCell.innerHTML = `<span class="status-none" style="padding-left: 15px;">none</span>`
        }
        const row = clone.querySelector("tr")
        row.dataset.status = c.status
        row.dataset.containerName = c.name
        row.dataset.serverName = c.server
        const actionButtons = clone.querySelectorAll(".action-btn")
        actionButtons.forEach(button => {
          if (button.classList.contains("logs-btn")) {
            button.addEventListener("click", () =>
              openLogsModal(c.server, c.name)
            )
            return
          }
          button.addEventListener("click", handleContainerAction)
          const action = button.dataset.action
          if (
            (action === "start" && c.status === "running") ||
            (action === "stop" && c.status === "exited")
          ) {
            button.disabled = true
          }
        })
        fragment.appendChild(clone)
      }
    }

    containerRowsBody.appendChild(fragment)
  }

  function setupServerUI() {
    serverFilterContainer.innerHTML = ""
    const servers = [...allServersData]

    if (servers.length > 1) {
      mainTable.classList.remove("table-single-server")

      servers.sort((a, b) => {
        if (a.status !== "inactive" && b.status === "inactive") return -1
        if (a.status === "inactive" && b.status !== "inactive") return 1

        if (a.order !== b.order) {
          return a.order - b.order
        }

        return a.name.localeCompare(b.name)
      })

      const allButton = document.createElement("button")
      allButton.textContent = "All"
      allButton.dataset.server = "all"
      allButton.className = "filter-button"
      serverFilterContainer.appendChild(allButton)

      servers.forEach(server => {
        const button = document.createElement("button")
        button.textContent = server.name
        button.dataset.server = server.name
        button.className = "filter-button"

        if (server.status === "inactive") {
          button.classList.add("inactive")
          button.disabled = true
          button.title = `${server.name} is offline`
        }
        serverFilterContainer.appendChild(button)
      })

      serverFilterContainer
        .querySelectorAll(".filter-button:not(:disabled)")
        .forEach(button => {
          button.addEventListener("click", () => {
            currentServerFilter = button.dataset.server
            updateDisplay()
          })
        })
    } else {
      mainTable.classList.add("table-single-server")
    }

    updateActiveButton()
  }

  function updateActiveButton() {
    serverFilterContainer.querySelectorAll(".filter-button").forEach(button => {
      if (button.dataset.server === currentServerFilter) {
        button.classList.add("active")
      } else {
        button.classList.remove("active")
      }
    })
  }

  function updateDisplay() {
    let workingData = [...allContainersData]

    if (currentServerFilter !== "all") {
      workingData = workingData.filter(c => c.server === currentServerFilter)
    }

    const searchTerm = searchInput.value.toLowerCase().trim()
    if (searchTerm) {
      workingData = workingData.filter(
        c =>
          c.name.toLowerCase().includes(searchTerm) ||
          c.image.toLowerCase().includes(searchTerm) ||
          c.ports.some(
            p =>
              p.host_port.includes(searchTerm) ||
              p.container_port.includes(searchTerm)
          )
      )
    }

    workingData.sort((a, b) => {
      let valA = a[currentSortColumn]
      let valB = b[currentSortColumn]

      if (currentSortColumn === "status") {
        const statusOrder = { running: 1, exited: 2 }
        valA = statusOrder[valA] || 0
        valB = statusOrder[valB] || 0
      } else if (currentSortColumn === "ports") {
        const getFirstPort = container =>
          container.ports.length > 0
            ? parseInt(container.ports[0].host_port, 10)
            : 0
        valA = getFirstPort(a)
        valB = getFirstPort(b)
      } else if (typeof valA === "string" && typeof valB === "string") {
        valA = valA.toLowerCase()
        valB = valB.toLowerCase()
      }

      if (valA < valB) return currentSortDirection === "asc" ? -1 : 1
      if (valA > valB) return currentSortDirection === "asc" ? 1 : -1
      return 0
    })

    filteredAndSortedContainers = workingData
    hideLoadingIndicator()
    renderTable()
    updateActiveButton()
  }

  async function fetchContainerData() {
    showLoadingIndicator()

    try {
      const response = await fetch("/data")

      if (!response.ok) {
        throw createResponseError(response)
      }

      const { servers = [], containers = [] } = await response.json()
      ;[allServersData, allContainersData] = [servers, containers]

      handleServerFilterReset()
      handleSingleServerMode()

      setupServerUI()
      updateDisplay()
    } catch (error) {
      handleFetchError(error)
    } finally {
      hideLoadingIndicator()
    }
  }

  function createResponseError(response) {
    const status = response.status
    const messages = {
      401: `Authorization Error (${status}): Please log in again`,
      403: `Authorization Error (${status}): Access denied`,
      500: `Server Error (${status}): Please try again later`,
      default: `HTTP Error: ${status} ${response.statusText}`,
    }
    return new Error(messages[status] || messages.default)
  }

  function handleServerFilterReset() {
    const shouldReset =
      !allServersData.some(s => s.name === currentServerFilter) ||
      allServersData.find(s => s.name === currentServerFilter)?.status ===
        "inactive" ||
      (allServersData.length === 1 && allServersData[0].status === "inactive")

    if (shouldReset) {
      currentServerFilter = "all"
      console.log('Server filter reset to "all" due to server unavailability')
    }
  }

  function handleSingleServerMode() {
    const noActiveServers =
      allServersData.length === 0 ||
      allServersData.every(s => s.status === "inactive")

    mainTable.classList.toggle("table-single-server", noActiveServers)

    if (noActiveServers) {
      console.warn(
        "No active servers available - switching to single-server mode"
      )
    }
  }

  function handleFetchError(error) {
    console.error("Data fetch error:", error)

    const message = error.message.includes("Failed to fetch")
      ? "Network Error: Could not connect to backend service"
      : error.message

    displayError(message)
  }

  function applyTheme(theme) {
    const themeIcon = document.getElementById("theme-icon")
    if (theme === "dark") {
      body.classList.add("dark-mode")
      themeIcon.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 11.5373 21.3065 11.4608 21.0672 11.8568C19.9289 13.7406 17.8615 15 15.5 15C11.9101 15 9 12.0899 9 8.5C9 6.13845 10.2594 4.07105 12.1432 2.93276C12.5392 2.69347 12.4627 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></svg>`
    } else {
      body.classList.remove("dark-mode")
      themeIcon.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 3V4M12 20V21M4 12H3M6.31412 6.31412L5.5 5.5M17.6859 6.31412L18.5 5.5M6.31412 17.69L5.5 18.5001M17.6859 17.69L18.5 18.5001M21 12H20M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    }
    localStorage.setItem("theme", theme)
  }

  const modal = document.getElementById("confirmation-modal")
  const modalConfirmBtn = document.getElementById("modal-confirm-button")
  const modalCancelBtn = document.getElementById("modal-cancel-button")

  function showConfirmationModal(title, message, confirmText = "Confirm") {
    return new Promise((resolve, reject) => {
      document.getElementById("modal-title").textContent = title
      document.getElementById("modal-message").textContent = message
      modalConfirmBtn.textContent = confirmText
      modal.classList.remove("hidden")

      const confirmHandler = () => {
        modal.classList.add("hidden")
        cleanup()
        resolve()
      }

      const cancelHandler = () => {
        modal.classList.add("hidden")
        cleanup()
        reject()
      }

      const backdropClickHandler = e => {
        if (e.target === modal) {
          cancelHandler()
        }
      }

      const cleanup = () => {
        modalConfirmBtn.removeEventListener("click", confirmHandler)
        modalCancelBtn.removeEventListener("click", cancelHandler)
        modal.removeEventListener("click", backdropClickHandler)
      }

      modalConfirmBtn.addEventListener("click", confirmHandler, { once: true })
      modalCancelBtn.addEventListener("click", cancelHandler, { once: true })
      modal.addEventListener("click", backdropClickHandler, { once: true })
    })
  }

  // === Container Management Functions ===

  function showNotification(message, type = "info") {
    const notification = document.createElement("div")
    notification.className = `notification ${type}`
    notification.textContent = message

    document.body.appendChild(notification)

    // Trigger the animation
    setTimeout(() => notification.classList.add("show"), 10)

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.classList.remove("show")
      setTimeout(() => document.body.removeChild(notification), 300)
    }, 4000)
  }

  async function performContainerAction(serverName, containerName, action) {
    const url = `/container/${encodeURIComponent(
      serverName
    )}/${encodeURIComponent(containerName)}/${action}`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const result = await response.json()

      if (result.success) {
        showNotification(result.message, "success")
        // Refresh container data to reflect changes
        setTimeout(fetchContainerData, 1000)
      } else {
        showNotification(result.error, "error")
      }

      return result
    } catch (error) {
      console.error(`Error performing ${action} on container:`, error)
      showNotification(
        `Failed to ${action} container: ${error.message}`,
        "error"
      )
      return { success: false, error: error.message }
    }
  }

  async function handleContainerAction(event) {
    const button = event.target
    const action = button.dataset.action
    const row = button.closest("tr")
    const containerName = row.dataset.containerName
    const serverName = row.dataset.serverName

    // Prevent multiple clicks
    if (button.disabled || button.classList.contains("loading")) {
      return
    }

    // Show confirmation for destructive actions
    if (action === "remove") {
      try {
        await showConfirmationModal(
          "Remove Container",
          `Are you sure you want to remove container "${containerName}"? This action cannot be undone.`,
          "Remove"
        )
      } catch {
        return // User cancelled
      }
    } else if (action === "stop") {
      try {
        await showConfirmationModal(
          "Stop Container",
          `Are you sure you want to stop container "${containerName}"?`,
          "Stop"
        )
      } catch {
        return // User cancelled
      }
    }

    // Set loading state
    button.classList.add("loading")
    button.disabled = true

    // Disable all action buttons in this row during operation
    const allButtonsInRow = row.querySelectorAll(".action-btn")
    allButtonsInRow.forEach(btn => (btn.disabled = true))

    try {
      const result = await performContainerAction(
        serverName,
        containerName,
        action
      )

      if (result.success) {
        // Update button states based on action
        updateButtonStatesAfterAction(row, action)
      }
    } finally {
      // Re-enable buttons
      setTimeout(() => {
        allButtonsInRow.forEach(btn => {
          btn.classList.remove("loading")
          // Re-evaluate which buttons should be enabled based on new status
          const currentStatus = row.dataset.status
          const btnAction = btn.dataset.action

          btn.disabled =
            (btnAction === "start" && currentStatus === "running") ||
            (btnAction === "stop" && currentStatus === "exited")
        })
      }, 500)
    }
  }

  function updateButtonStatesAfterAction(row, action) {
    // Optimistically update the status for immediate feedback
    let newStatus = row.dataset.status

    switch (action) {
      case "start":
        newStatus = "running"
        break
      case "stop":
        newStatus = "exited"
        break
      case "restart":
        newStatus = "running"
        break
      case "remove":
        // Container will be removed, row will disappear on next refresh
        row.style.opacity = "0.5"
        return
    }

    // Update the status in the row
    row.dataset.status = newStatus
    const statusCell = row.querySelector(".table-cell-status")
    statusCell.textContent = newStatus
    statusCell.className = `py-3 px-4 border-b border-gray-200 table-cell-status ${
      newStatus === "running" ? "status-running" : "status-exited"
    }`
  }

  // Logs modal logic
  const logsModal = document.getElementById("logs-modal")
  const logsContent = document.getElementById("logs-content")
  const logsTail = document.getElementById("logs-tail")
  const logsRefresh = document.getElementById("logs-refresh")
  const logsCopy = document.getElementById("logs-copy")
  const logsClose = document.getElementById("logs-close")
  let lastLogsContext = { server: null, container: null }

  async function openLogsModal(server, container) {
    lastLogsContext = { server, container }
    logsModal.classList.remove("hidden")
    await loadLogs()
  }

  async function loadLogs() {
    if (!lastLogsContext.server || !lastLogsContext.container) return
    const tail = parseInt(logsTail.value, 10) || 200
    const url = `/container/${encodeURIComponent(
      lastLogsContext.server
    )}/${encodeURIComponent(lastLogsContext.container)}/logs?tail=${tail}`
    logsContent.textContent = "Loading..."
    try {
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.success) {
        logsContent.textContent = data.logs || ""
      } else {
        logsContent.textContent = `Error: ${data.error}`
      }
    } catch (e) {
      logsContent.textContent = `Error: ${e.message}`
    }
  }

  logsRefresh.addEventListener("click", loadLogs)
  logsTail.addEventListener("change", loadLogs)
  logsCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(logsContent.textContent || "")
      showNotification("Logs copied to clipboard", "success")
    } catch (e) {
      showNotification("Failed to copy logs", "error")
    }
  })
  logsClose.addEventListener("click", () => logsModal.classList.add("hidden"))

  // Group toggle
  const groupToggle = document.getElementById("group-toggle")
  groupToggle.addEventListener("click", () => {
    groupByProject = !groupByProject
    groupToggle.textContent = groupByProject ? "Group by project" : "Ungroup"
    renderTable()
  })

  fetchContainerData()

  applyTheme(localStorage.getItem("theme") || "dark")

  refreshButton.addEventListener("click", fetchContainerData)

  document.getElementById("theme-switcher").addEventListener("click", () => {
    applyTheme(body.classList.contains("dark-mode") ? "light" : "dark")
  })

  searchInput.addEventListener("input", updateDisplay)

  document.querySelectorAll(".sortable-header").forEach(header => {
    header.addEventListener("click", () => {
      const column = header.dataset.sortColumn
      if (column === currentSortColumn) {
        currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc"
      } else {
        currentSortColumn = column
        currentSortDirection = "asc"
      }
      document
        .querySelectorAll(".sortable-header")
        .forEach(h => h.classList.remove("asc", "desc"))
      header.classList.add(currentSortDirection)

      updateDisplay()
    })
  })

  document
    .getElementById("export-json-button")
    .addEventListener("click", async () => {
      if (filteredAndSortedContainers.length === 0) {
        alert("No data to export.")
        return
      }

      try {
        await showConfirmationModal(
          "Export to JSON",
          "Are you sure you want to download the currently displayed container data as a JSON file?",
          "Download"
        )

        const exportData = {
          meta: {
            generated: new Date().toISOString(),
          },
          containers: filteredAndSortedContainers.map(container => ({
            name: container.name,
            status: container.status,
            server: container.server,
            ports: container.ports.map(p => ({
              mapping: `${p.host_port}:${p.container_port}`,
              accessible_at: p.link,
              host_port: parseInt(p.host_port),
              container_port: p.container_port.replace("/tcp", ""),
            })),
          })),
        }

        const jsonContent = JSON.stringify(exportData, null, 2)
        const blob = new Blob([jsonContent], { type: "application/json" })
        const link = document.createElement("a")
        link.href = URL.createObjectURL(blob)
        link.download = `dockpeek_export_${new Date()
          .toISOString()
          .slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch {
        console.log("Export cancelled by user.")
      }
    })
})
