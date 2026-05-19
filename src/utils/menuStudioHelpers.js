/**
 * Pure helper functions for Menu Studio.
 * No React state, no hooks, no side effects.
 */

export function flattenToastMenus(data) {
  const items = []
  if (!data || typeof data !== 'object') return items
  const menus = Array.isArray(data) ? data : data.menus || data.items || []
  for (const menu of menus) {
    const menuName = menu.name || menu.posName || menu.displayName || 'Menu'
    const groups = menu.menuGroups || menu.menuItemGroups || menu.groups || []
    for (const grp of groups) {
      const cat = grp.name || grp.posName || grp.displayName || menuName
      const entries = grp.menuItems || grp.items || []
      for (const ent of entries) {
        const name = ent.name || ent.posName || ent.displayName || ''
        const description = ent.description || ''
        const guid = ent.guid ?? ent.id
        const imageUrl = ent.imageUrl ?? ent.image ?? ent.imageUrlLarge ?? ent.highResImage
        if (name) {
          items.push({
            name,
            description: description || '',
            category: cat,
            ...(guid != null && { guid: String(guid) }),
            ...(imageUrl && { imageUrl: String(imageUrl) }),
          })
        }
      }
    }
  }
  return items
}

export function dedupeByName(items) {
  const seen = new Set()
  return items.filter((i) => {
    const key = `${(i.name || '').toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normName(name) {
  return (name || '').toLowerCase().trim()
}

/** Graveyarded items whose name appears in the Toast menu list = "ghosts" (returned to menu) */
export function computeGhostNames(items, toastFlatList) {
  const graveyarded = items.filter((i) => i.inGraveyard)
  const toastNames = new Set((toastFlatList || []).map((it) => normName(it.name)))
  return graveyarded.filter((i) => toastNames.has(normName(i.name))).map((i) => normName(i.name))
}

export function normalizeForComparison(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function consolidateSizeVariantsLocal(itemList) {
  const SIZE_PREFIX = /^(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF)\s+/i
  const SIZE_SUFFIX = /\s+(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF)$/i
  const groups = new Map()

  for (const item of itemList) {
    const name = (item.name || '').trim()
    let baseName = name
    let size = null
    const prefixMatch = name.match(SIZE_PREFIX)
    if (prefixMatch) {
      size = prefixMatch[0].trim()
      baseName = name.replace(SIZE_PREFIX, '').trim()
    } else {
      const suffixMatch = name.match(SIZE_SUFFIX)
      if (suffixMatch) {
        size = suffixMatch[0].trim()
        baseName = name.replace(SIZE_SUFFIX, '').trim()
      }
    }
    const key = baseName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
    if (!groups.has(key)) {
      groups.set(key, { baseName, items: [], sizes: [], bestItem: null })
    }
    const group = groups.get(key)
    group.items.push(item)
    if (size) {
      group.sizes.push(size.replace(/^BTL$/i, 'Bottle').replace(/^PINT$/i, 'Pint').replace(/^QT$/i, 'Quart'))
    }
    if (!group.bestItem || (item.description && !group.bestItem.description) || (item.imageUrl && !group.bestItem.imageUrl)) {
      group.bestItem = item
    }
  }

  const resultList = []
  for (const [, group] of groups) {
    if (group.items.length === 1) {
      resultList.push(group.items[0])
    } else if (group.sizes.length > 0) {
      const sizeList = [...new Set(group.sizes)].sort((a, b) => {
        const na = parseFloat(a)
        const nb = parseFloat(b)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.localeCompare(b)
      }).join(', ')
      const rep = { ...group.bestItem }
      rep.name = group.baseName
      rep.description = ((rep.description || '') + '\nAvailable in: ' + sizeList).trim()
      rep._consolidatedFrom = group.items.map((i) => i.name)
      const images = group.items.map((i) => i.imageUrl).filter(Boolean)
      if (images.length > 0) rep.imageUrl = images[0]
      resultList.push(rep)
      console.log('🔗 Consolidated ' + group.items.length + ' variants → "' + group.baseName + '" (' + sizeList + ')')
    } else {
      resultList.push(...group.items)
    }
  }
  console.log('📦 Consolidation: ' + itemList.length + ' items → ' + resultList.length + ' (merged ' + (itemList.length - resultList.length) + ' size variants)')
  return resultList
}
