class GPSSimulator {
  constructor() {
    this.simulations = new Map();
  }

  /**
   * Create a GPS simulation for a route
   */
  createSimulation(logisticsId, route) {
    const waypoints = route.waypoints || [];
    if (waypoints.length < 2) {
      throw new Error('Route must have at least 2 waypoints');
    }

    // Generate path points between waypoints
    const path = this.generatePath(waypoints);
    
    const simulation = {
      logistics_id: logisticsId,
      waypoints: waypoints,
      path: path,
      current_index: 0,
      is_running: false,
      is_paused: false,
      speed: 1, // km per tick
      interval: null
    };

    this.simulations.set(logisticsId, simulation);
    return simulation;
  }

  /**
   * Generate smooth path between waypoints
   */
  generatePath(waypoints) {
    const path = [];
    const steps = 20; // Points between each waypoint

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const lat = from.latitude + (to.latitude - from.latitude) * t;
        const lng = from.longitude + (to.longitude - from.longitude) * t;
        path.push({
          lat: lat,
          lng: lng,
          waypoint_index: i,
          progress: t
        });
      }
    }

    return path;
  }

  /**
   * Start GPS simulation
   */
  start(logisticsId, callback) {
    const sim = this.simulations.get(logisticsId);
    if (!sim) {
      throw new Error('Simulation not found');
    }

    if (sim.is_running) {
      return;
    }

    sim.is_running = true;
    sim.is_paused = false;

    // Clear existing interval
    if (sim.interval) {
      clearInterval(sim.interval);
    }

    sim.interval = setInterval(() => {
      if (sim.is_paused) return;

      if (sim.current_index >= sim.path.length - 1) {
        // Reached destination
        this.stop(logisticsId);
        callback({
          status: 'completed',
          logistics_id: logisticsId,
          position: sim.path[sim.path.length - 1]
        });
        return;
      }

      sim.current_index = Math.min(sim.current_index + 3, sim.path.length - 1);
      const position = sim.path[sim.current_index];

      callback({
        status: 'in_transit',
        logistics_id: logisticsId,
        position: position,
        progress: (sim.current_index / sim.path.length) * 100
      });

    }, 1000);

    return sim;
  }

  /**
   * Pause GPS simulation
   */
  pause(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (sim) {
      sim.is_paused = true;
      return true;
    }
    return false;
  }

  /**
   * Resume GPS simulation
   */
  resume(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (sim) {
      sim.is_paused = false;
      return true;
    }
    return false;
  }

  /**
   * Stop GPS simulation
   */
  stop(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (sim) {
      if (sim.interval) {
        clearInterval(sim.interval);
        sim.interval = null;
      }
      sim.is_running = false;
      sim.is_paused = false;
      return true;
    }
    return false;
  }

  /**
   * Reset GPS simulation
   */
  reset(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (sim) {
      if (sim.interval) {
        clearInterval(sim.interval);
        sim.interval = null;
      }
      sim.current_index = 0;
      sim.is_running = false;
      sim.is_paused = false;
      return true;
    }
    return false;
  }

  /**
   * Get current position
   */
  getPosition(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (sim && sim.path && sim.path[sim.current_index]) {
      return sim.path[sim.current_index];
    }
    return null;
  }

  /**
   * Get simulation status
   */
  getStatus(logisticsId) {
    const sim = this.simulations.get(logisticsId);
    if (!sim) return null;

    return {
      is_running: sim.is_running,
      is_paused: sim.is_paused,
      progress: (sim.current_index / sim.path.length) * 100,
      current_position: sim.path[sim.current_index] || null,
      total_waypoints: sim.waypoints.length,
      current_waypoint: sim.waypoints[sim.current_index] || null
    };
  }
}

module.exports = new GPSSimulator();