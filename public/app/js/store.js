import { api } from './api.js';

export const state = {
  user: null,
  team: [],
};

export async function loadTeam() {
  if (state.team.length) return state.team;
  try {
    const data = await api.get('/team');
    state.team = data.users || [];
  } catch (err) {
    state.team = [];
  }
  return state.team;
}
