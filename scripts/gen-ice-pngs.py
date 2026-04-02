#!/usr/bin/env python3
"""Generate 6 ice overlay PNGs — Hearthstone-style frozen card effect.
Uses diffusion-limited aggregation for crystal growth, dendritic frost
patterns, branching cracks, and layered depth. Pure Python stdlib."""

import struct, zlib, math, random, os

W, H = 400, 200

def write_png(path, pixels, w, h):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            raw += struct.pack("BBBB", *pixels[y * w + x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw, 9))
    iend = chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(sig + ihdr + idat + iend)


# ── Noise functions ──

def hash2d(x, y, seed=0):
    """Integer hash -> float 0-1."""
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xffffffff
    n = ((n >> 13) ^ n) & 0xffffffff
    n = (n * (n * n * 15731 + 789221) + 1376312589) & 0xffffffff
    return (n & 0x7fffffff) / 0x7fffffff

def smooth_noise(x, y, seed=0):
    """Bilinear interpolated noise."""
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    # Smoothstep
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = hash2d(ix, iy, seed)
    b = hash2d(ix + 1, iy, seed)
    c = hash2d(ix, iy + 1, seed)
    d = hash2d(ix + 1, iy + 1, seed)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy

def fbm(x, y, octaves=5, seed=0):
    """Fractal Brownian motion."""
    v, amp, freq = 0.0, 1.0, 1.0
    for i in range(octaves):
        v += smooth_noise(x * freq, y * freq, seed + i * 31) * amp
        amp *= 0.5
        freq *= 2.0
    return v / (2.0 - 2.0 ** (1 - octaves))


# ── Frost growth via edge-seeded flood fill with noise ──

def grow_frost(w, h, reach, density, seed=42):
    """Grow ice from edges inward using a BFS with noisy thresholds.
    Returns a 2D array of frost intensity (0-1)."""
    rng = random.Random(seed)
    frost = [[0.0] * w for _ in range(h)]
    visited = [[False] * w for _ in range(h)]

    # Seed edges
    queue = []
    for x in range(w):
        for y_edge in [0, 1, h - 2, h - 1]:
            queue.append((x, y_edge, 1.0))
            visited[y_edge][x] = True
    for y in range(h):
        for x_edge in [0, 1, w - 2, w - 1]:
            if not visited[y][x_edge]:
                queue.append((x_edge, y, 1.0))
                visited[y][x_edge] = True

    # Seed corners extra thick
    corner_r = int(min(w, h) * 0.15)
    for cx, cy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        for dx in range(-corner_r, corner_r + 1):
            for dy in range(-corner_r, corner_r + 1):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                    d = math.sqrt(dx * dx + dy * dy)
                    if d < corner_r:
                        queue.append((nx, ny, 1.0 - d / corner_r * 0.3))
                        visited[ny][nx] = True

    max_dist = reach * min(w, h) * 0.5
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)]

    idx = 0
    while idx < len(queue):
        x, y, intensity = queue[idx]
        idx += 1
        frost[y][x] = max(frost[y][x], intensity)

        if intensity < 0.05:
            continue

        for dx, dy in dirs:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                # Noise-modulated decay — creates jagged edges
                n = fbm(nx / 15.0, ny / 15.0, 4, seed)
                decay = 0.02 + (1.0 - density) * 0.06 + n * 0.03
                diag = 1.414 if (dx != 0 and dy != 0) else 1.0
                new_intensity = intensity - decay * diag

                # Distance check
                d_edge = min(nx, w - 1 - nx, ny, h - 1 - ny)
                if d_edge > max_dist:
                    new_intensity *= 0.3

                if new_intensity > 0.05:
                    visited[ny][nx] = True
                    queue.append((nx, ny, new_intensity))

    return frost


# ── Dendritic ice crystal arms ──

def grow_dendrite(frost, w, h, start_x, start_y, angle, length, thickness, rng, seed):
    """Grow a branching ice dendrite (fern-like crystal arm)."""
    x, y = float(start_x), float(start_y)
    branch_prob = 0.03

    for step in range(int(length)):
        ix, iy = int(x), int(y)
        t = 1.0 - step / length  # taper

        # Draw thick line
        r = max(1, int(thickness * t))
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                px, py = ix + dx, iy + dy
                if 0 <= px < w and 0 <= py < h:
                    d = math.sqrt(dx * dx + dy * dy)
                    if d <= r:
                        v = t * (1.0 - d / max(r, 1)) * 0.9
                        frost[py][px] = max(frost[py][px], v)

        # Wobble direction
        angle += rng.uniform(-0.15, 0.15)
        n = smooth_noise(x / 8, y / 8, seed + 77)
        angle += (n - 0.5) * 0.2
        x += math.cos(angle) * 1.5
        y += math.sin(angle) * 1.5

        # Branch
        if step > 10 and rng.random() < branch_prob and t > 0.3:
            branch_angle = angle + rng.choice([-1, 1]) * (math.pi / 4 + rng.uniform(-0.3, 0.3))
            grow_dendrite(frost, w, h, int(x), int(y), branch_angle,
                          length * t * rng.uniform(0.2, 0.4),
                          max(1, thickness * 0.5), rng, seed + step)


# ── Ice cracks with branching ──

def draw_crack(pixels, w, h, start_x, start_y, angle, length, rng, depth=0):
    """Draw a branching ice crack with glow."""
    x, y = float(start_x), float(start_y)
    branch_prob = 0.04 if depth == 0 else 0.02

    for step in range(int(length)):
        ix, iy = int(x), int(y)
        t = 1.0 - step / length

        if 0 <= ix < w and 0 <= iy < h:
            # Bright core
            alpha = int(min(255, 200 * t + 55))
            old = pixels[iy * w + ix]
            pixels[iy * w + ix] = (230, 245, 255, max(old[3], alpha))

            # Glow halo (2px radius)
            for r in range(1, 3):
                glow_a = int(80 * t / r)
                for dx in range(-r, r + 1):
                    for dy in range(-r, r + 1):
                        if dx * dx + dy * dy <= r * r:
                            gx, gy = ix + dx, iy + dy
                            if 0 <= gx < w and 0 <= gy < h:
                                og = pixels[gy * w + gx]
                                pixels[gy * w + gx] = (
                                    max(og[0], 200), max(og[1], 235), max(og[2], 252),
                                    min(255, og[3] + glow_a)
                                )

        angle += rng.uniform(-0.25, 0.25)
        speed = 1.2 + rng.uniform(0, 0.8)
        x += math.cos(angle) * speed
        y += math.sin(angle) * speed

        # Branch
        if depth < 2 and step > 5 and rng.random() < branch_prob and t > 0.2:
            ba = angle + rng.choice([-1, 1]) * (math.pi / 5 + rng.uniform(-0.2, 0.2))
            draw_crack(pixels, w, h, int(x), int(y), ba,
                       length * t * rng.uniform(0.25, 0.5), rng, depth + 1)


# ── Sparkle/highlight spots (light refracting through ice facets) ──

def add_sparkles(pixels, w, h, frost_map, count, rng, max_alpha):
    """Add bright sparkle dots where ice is thick."""
    for _ in range(count):
        x = rng.randint(0, w - 1)
        y = rng.randint(0, h - 1)
        if frost_map[y][x] > 0.4:
            # Bright white spot with soft falloff
            r = rng.randint(2, 4)
            brightness = frost_map[y][x]
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    px, py = x + dx, y + dy
                    if 0 <= px < w and 0 <= py < h:
                        d = math.sqrt(dx * dx + dy * dy)
                        if d <= r:
                            sa = int(brightness * max_alpha * 255 * (1 - d / r) ** 2)
                            old = pixels[py * w + px]
                            pixels[py * w + px] = (
                                min(255, max(old[0], 240)),
                                min(255, max(old[1], 248)),
                                255,
                                min(255, old[3] + sa)
                            )


# ── Color mapping ──

def ice_pixel(frost_val, fbm_val, max_alpha):
    """Convert frost intensity to an RGBA ice pixel with depth."""
    if frost_val < 0.01:
        return (0, 0, 0, 0)

    # Color layers: deep blue (thick) -> cyan (medium) -> white (surface/highlights)
    if frost_val > 0.7:
        # Deep ice — darker blue
        r = int(120 + 40 * fbm_val)
        g = int(180 + 30 * fbm_val)
        b = int(220 + 20 * fbm_val)
    elif frost_val > 0.4:
        # Mid ice — cyan
        r = int(150 + 50 * fbm_val)
        g = int(210 + 30 * fbm_val)
        b = int(240 + 15 * fbm_val)
    else:
        # Surface frost — light blue-white
        r = int(190 + 50 * fbm_val)
        g = int(230 + 20 * fbm_val)
        b = int(248 + 7 * fbm_val)

    # Alpha with curve for sharper visible edges
    alpha = frost_val ** 0.7 * max_alpha
    return (min(255, r), min(255, g), min(255, b), min(255, int(alpha * 255)))


# ── Main generation per stage ──

def generate_stage(stage, w, h):
    rng = random.Random(stage * 13 + 7)
    seed = stage * 31

    # Config per stage
    reach =    [0.06, 0.15, 0.30, 0.50, 0.75, 1.00][stage - 1]
    density =  [0.30, 0.45, 0.60, 0.72, 0.85, 0.95][stage - 1]
    max_alpha =[0.50, 0.60, 0.72, 0.82, 0.90, 0.95][stage - 1]
    n_dendrites =   [4, 8, 14, 20, 28, 0][stage - 1]  # stage 6 is solid, no dendrites needed
    n_cracks =      [0, 0, 3, 6, 10, 14][stage - 1]
    n_sparkles =    [5, 15, 30, 50, 80, 120][stage - 1]

    print(f"  Growing frost (reach={reach}, density={density})...")
    frost = grow_frost(w, h, reach, density, seed)

    # Grow dendritic crystal arms from edges inward
    if n_dendrites > 0:
        print(f"  Growing {n_dendrites} dendrites...")
        for _ in range(n_dendrites):
            # Start from edge
            side = rng.randint(0, 3)
            if side == 0:
                sx, sy = rng.randint(0, w - 1), 0
                angle = math.pi / 2 + rng.uniform(-0.4, 0.4)
            elif side == 1:
                sx, sy = rng.randint(0, w - 1), h - 1
                angle = -math.pi / 2 + rng.uniform(-0.4, 0.4)
            elif side == 2:
                sx, sy = 0, rng.randint(0, h - 1)
                angle = 0 + rng.uniform(-0.4, 0.4)
            else:
                sx, sy = w - 1, rng.randint(0, h - 1)
                angle = math.pi + rng.uniform(-0.4, 0.4)

            length = reach * min(w, h) * rng.uniform(0.4, 0.9)
            thickness = 2 + stage * 0.5
            grow_dendrite(frost, w, h, sx, sy, angle, length, thickness, rng, seed + _)

    # Convert frost map to pixels
    print(f"  Rendering pixels...")
    pixels = [(0, 0, 0, 0)] * (w * h)
    for y in range(h):
        for x in range(w):
            f = frost[y][x]
            if f > 0.01:
                n = fbm(x / 20.0, y / 20.0, 4, seed + 99)
                pixels[y * w + x] = ice_pixel(f, n, max_alpha)

    # Draw cracks
    if n_cracks > 0:
        print(f"  Drawing {n_cracks} cracks...")
        for _ in range(n_cracks):
            side = rng.randint(0, 3)
            if side == 0: sx, sy = rng.randint(0, w), 0
            elif side == 1: sx, sy = rng.randint(0, w), h - 1
            elif side == 2: sx, sy = 0, rng.randint(0, h)
            else: sx, sy = w - 1, rng.randint(0, h)
            angle = math.atan2(h / 2 - sy, w / 2 - sx) + rng.uniform(-0.5, 0.5)
            length = reach * min(w, h) * rng.uniform(0.5, 1.0)
            draw_crack(pixels, w, h, sx, sy, angle, length, rng)

    # Add sparkle highlights
    if n_sparkles > 0:
        print(f"  Adding {n_sparkles} sparkles...")
        add_sparkles(pixels, w, h, frost, n_sparkles, rng, max_alpha)

    return pixels


# ── Generate all 6 ──

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
os.makedirs(out_dir, exist_ok=True)

for stage in range(1, 7):
    path = os.path.join(out_dir, f"ice-{stage}.png")
    print(f"\n=== Stage {stage} ===")
    pixels = generate_stage(stage, W, H)
    write_png(path, pixels, W, H)
    size_kb = os.path.getsize(path) / 1024
    print(f"  -> {path} ({size_kb:.1f} KB)")

print("\nDone!")
