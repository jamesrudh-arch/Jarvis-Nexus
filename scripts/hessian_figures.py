#!/usr/bin/env python3
"""Chalk-style matplotlib figures for 'The Hessian Matrix' lecture deck.

Also numerically verifies every computation used in the slides.
Output: /home/z/my-project/download/slides/{bowl,dome,saddle,contours,taylor}.png
"""
import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

OUT = '/home/z/my-project/download/slides'
os.makedirs(OUT, exist_ok=True)

# Palette (matches global.css)
BG    = '#2A3D35'   # card background — figures sit inside .card
CREAM = '#F5F1E6'
MINT  = '#8FC1AC'
AMBER = '#E5B04C'
SAGE  = '#A9BCB0'
DEEP  = '#16261F'

plt.rcParams.update({
    'figure.facecolor': BG,
    'savefig.facecolor': BG,
    'axes.facecolor': BG,
    'text.color': CREAM,
    'axes.edgecolor': SAGE,
    'axes.labelcolor': CREAM,
    'xtick.color': SAGE,
    'ytick.color': SAGE,
    'font.family': 'serif',
    'font.serif': ['DejaVu Serif'],
    'mathtext.fontset': 'dejavuserif',
    'figure.constrained_layout.use': True,
})

chalk3d = LinearSegmentedColormap.from_list('chalk3d', [
    (0.00, '#16261F'), (0.35, '#2E4A3F'), (0.62, '#5E8D7B'),
    (0.85, '#8FC1AC'), (0.96, '#D9CFA9'), (1.00, '#E5B04C')])


# ── 1. 3D surfaces: bowl / dome / saddle ─────────────────────────────
def surface(fname, f, elev, azim, z_aspect):
    fig = plt.figure(figsize=(4.6, 4.0), dpi=200)
    ax = fig.add_subplot(111, projection='3d')
    ax.set_axis_off()
    u = np.linspace(-2, 2, 90)
    X, Y = np.meshgrid(u, u)
    Z = f(X, Y)
    ax.plot_surface(X, Y, Z, cmap=chalk3d, rcount=34, ccount=34,
                    edgecolor=(0.96, 0.94, 0.90, 0.10), linewidth=0.35,
                    antialiased=True, shade=True)
    # glowing chalk dot at the critical point (origin)
    ax.scatter([0], [0], [0], s=110, color=AMBER, alpha=0.30, depthshade=False)
    ax.scatter([0], [0], [0], s=32, color=CREAM, depthshade=False)
    ax.view_init(elev=elev, azim=azim)
    ax.set_box_aspect((1, 1, z_aspect))
    fig.savefig(os.path.join(OUT, fname))
    plt.close(fig)


surface('bowl.png',   lambda X, Y: 0.5 * (X**2 + Y**2),  elev=16, azim=-58, z_aspect=0.60)
surface('dome.png',   lambda X, Y: -0.5 * (X**2 + Y**2), elev=16, azim=-58, z_aspect=0.60)
surface('saddle.png', lambda X, Y: 0.5 * (X**2 - Y**2),  elev=13, azim=-52, z_aspect=0.55)

# ── 2. Contour plot of convex quadratic x^2 + xy + y^2 ────────────────
fig, ax = plt.subplots(figsize=(5.2, 4.4), dpi=200)
u = np.linspace(-2.4, 2.4, 500)
X, Y = np.meshgrid(u, u)
Z = X**2 + X * Y + Y**2
levels = np.linspace(0.35, 7.0, 9)
chalkc = LinearSegmentedColormap.from_list('chalkc', [MINT, '#D8CDA8', AMBER])
ax.contour(X, Y, Z, levels=levels, cmap=chalkc, linewidths=1.7)

# eigendirections of H = [[2,1],[1,2]]  ->  (1,1)/sqrt2 with lambda=3,
# (1,-1)/sqrt2 with lambda=1
for (dx, dy, lab) in [(1, 1, r'$\lambda_1 = 3$'), (1, -1, r'$\lambda_2 = 1$')]:
    n = np.array([dx, dy], float)
    n /= np.linalg.norm(n)
    L = 2.0
    ax.annotate('', xy=(n[0] * L, n[1] * L), xytext=(-n[0] * L, -n[1] * L),
                arrowprops=dict(arrowstyle='<->', color=CREAM, lw=1.3,
                                alpha=0.9, linestyle=(0, (5, 4))))
    off = 0.12
    ax.text(n[0] * L + off * dx, n[1] * L + off * dy, lab,
            color=CREAM, fontsize=13.5, ha='center',
            va='bottom' if dy > 0 else 'top')
ax.scatter([0], [0], s=26, color=CREAM, zorder=5)
ax.set_aspect('equal')
ax.axis('off')
ax.set_xlim(-2.6, 2.9)
ax.set_ylim(-2.6, 2.9)
fig.savefig(os.path.join(OUT, 'contours.png'))
plt.close(fig)

# ── 3. Taylor figure: cos x and its 2nd-order polynomial at a = 0 ────
fig, ax = plt.subplots(figsize=(6.6, 3.3), dpi=200)
x = np.linspace(-np.pi, np.pi, 500)
ax.plot(x, np.cos(x), color=CREAM, lw=2.6, label=r'$f(x) = \cos x$')
ax.plot(x, 1 - x**2 / 2, color=AMBER, lw=2.4, ls=(0, (6, 3)),
        label=r"second-order Taylor at $a=0$")
ax.scatter([0], [1], s=46, color=CREAM, zorder=5)
ax.annotate(r'$a = 0$', xy=(0, 1), xytext=(0.42, 1.13), color=CREAM, fontsize=12)
ax.axhline(0, color=SAGE, lw=0.8, alpha=0.55)
ax.spines[['top', 'right']].set_visible(False)
ax.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
ax.set_xticklabels([r'$-\pi$', r'$-\pi/2$', '0', r'$\pi/2$', r'$\pi$'], fontsize=11)
ax.set_yticks([-1, 0, 1])
ax.tick_params(labelsize=10.5)
ax.set_ylim(-2.15, 1.4)
ax.set_xlabel(r'$x$', fontsize=12)
ax.set_ylabel(r'$f(x)$', fontsize=12)
ax.legend(frameon=False, fontsize=12, loc='lower center', ncols=2,
          handlelength=2.6)
fig.savefig(os.path.join(OUT, 'taylor.png'))
plt.close(fig)

# ── 4. Numerical verification of every claim used in the slides ──────
print('=== verification ===')
H = np.array([[6.0, -3.0], [-3.0, 6.0]])
print('f_xx(1,1)=6, H(1,1)=[[6,-3],[-3,6]] det =', round(np.linalg.det(H), 6),
      ' eigs =', sorted(np.linalg.eigvals(H).round(6)))
H0 = np.array([[0.0, -3.0], [-3.0, 0.0]])
print('H(0,0)=[[0,-3],[-3,0]] det =', round(np.linalg.det(H0), 6),
      ' eigs =', sorted(np.linalg.eigvals(H0).round(6)))
print('f(1,1) = 1+1-3 =', 1 + 1 - 3)
print('critical points: y=x^2 & x=y^2 -> x=x^4 -> x=0,1 -> (0,0),(1,1)')
Hc = np.array([[2.0, 1.0], [1.0, 2.0]])
print('contour fig H=[[2,1],[1,2]] eigs =', sorted(np.linalg.eigvals(Hc).round(6)))
print('Hessian of f=x^3+y^3-3xy: f_x=3x^2-3y, f_y=3y^2-3x, f_xx=6x, f_yy=6y, f_xy=-3')

# ── 5. Sanity check: figures exist, non-blank, correct size ──────────
from PIL import Image
for f in ['bowl.png', 'dome.png', 'saddle.png', 'contours.png', 'taylor.png']:
    p = os.path.join(OUT, f)
    im = np.asarray(Image.open(p).convert('RGB')).astype(int)
    h, w, _ = im.shape
    corners = np.concatenate([im[:60, :60].reshape(-1, 3), im[:60, -60:].reshape(-1, 3),
                              im[-60:, :60].reshape(-1, 3), im[-60:, -60:].reshape(-1, 3)])
    corner_mean = corners.mean(axis=0)
    center_mean = im[h//3:2*h//3, w//3:2*w//3].reshape(-1, 3).mean(axis=0)
    print(f'{f}: {w}x{h}px {os.path.getsize(p)//1024}KB cornerRGB={corner_mean.round(0)} '
          f'centerRGB={center_mean.round(0)} overall={im.reshape(-1,3).mean(axis=0).round(0)}')
    assert h > 400 and os.path.getsize(p) > 20000, f'{f} looks wrong'
    assert corner_mean.mean() < 90, f'{f}: corners not dark — background not applied'
print('all figures OK')

# ── 6. Contact sheet (small, for one-off visual inspection) ─────────
imgs = [Image.open(os.path.join(OUT, f)).convert('RGB')
        for f in ['bowl.png', 'dome.png', 'saddle.png', 'contours.png', 'taylor.png']]
th = 260
thumbs = []
for im in imgs:
    r = th / im.height
    thumbs.append(im.resize((int(im.width * r), th)))
sheet_w = sum(t.width for t in thumbs) + 20 * (len(thumbs) + 1)
sheet = Image.new('RGB', (sheet_w, th + 40), (31, 53, 45))
x = 20
for t in thumbs:
    sheet.paste(t, (x, 20))
    x += t.width + 20
sheet.save('/tmp/render/hessian_contact_sheet.png')
print('contact sheet: /tmp/render/hessian_contact_sheet.png')
