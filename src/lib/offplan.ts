import type { Project } from '../types'

export type Setting = 'waterfront' | 'inland'

const WATERFRONT =
  /waterfront|beach|palm|island|creek|harbou?r|marina|la mer|yacht|mina rashid|bluewaters|jumeirah bay|seafront|sea view|canal front|maritime/i

/** Waterfront when the Trello list or area names a coast, island, creek, or marina. Everything else is inland. */
export function projectSetting(project: Pick<Project, 'community' | 'area' | 'name'>): Setting {
  const text = `${project.community} ${project.area ?? ''} ${project.name}`
  if (/other inland/i.test(project.community)) return 'inland'
  return WATERFRONT.test(text) ? 'waterfront' : 'inland'
}

/** "G+45", "45 floors", or "45-storey" from the card text. Null when the card does not say. */
export function floorCount(text: string): string | null {
  const ground = text.match(/\b((?:\d?B\s*\+\s*)?G\s*\+\s*(?:\d{1,2}P\s*\+\s*)?\d{1,3})(?!\d)/i)
  if (ground) return ground[1].replace(/\s+/g, '').toUpperCase()
  const floors = text.match(/\b(\d{1,3})\s*[- ]?\s*(?:floors|storeys|stories|storey|story)\b/i)
  if (floors && Number(floors[1]) > 0 && Number(floors[1]) < 200) return `${Number(floors[1])} floors`
  return null
}

/** The Trello card mentions a launch, and is not one of the "not a new launch" sales offers. */
export function trelloNewLaunch(project: Pick<Project, 'name' | 'notes'>): boolean {
  const text = `${project.name}\n${project.notes}`
  if (/not a (?:new )?launch/i.test(text)) return false
  return /\b(?:new launch|launch(?:ed|ing)?\b)/i.test(text)
}
