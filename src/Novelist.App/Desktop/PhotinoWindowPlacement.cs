using System.Drawing;

namespace Novelist.App.Desktop;

internal static class PhotinoWindowPlacement
{
    public static Point ClampLocationToVisibleWorkArea(
        Point location,
        Size size,
        IReadOnlyList<Rectangle> workAreas)
    {
        ArgumentNullException.ThrowIfNull(workAreas);
        var validWorkAreas = workAreas
            .Where(area => area.Width > 0 && area.Height > 0)
            .ToArray();
        if (validWorkAreas.Length == 0)
        {
            return location;
        }

        var workArea = validWorkAreas.FirstOrDefault(area => area.Contains(location));
        if (workArea == Rectangle.Empty)
        {
            workArea = validWorkAreas
                .OrderBy(area => DistanceSquaredToRectangle(location, area))
                .First();
        }

        return ClampLocationToWorkArea(location, size, workArea);
    }

    private static Point ClampLocationToWorkArea(Point location, Size size, Rectangle workArea)
    {
        var effectiveWidth = Math.Min(Math.Max(size.Width, 1), workArea.Width);
        var effectiveHeight = Math.Min(Math.Max(size.Height, 1), workArea.Height);
        var maxX = Math.Max(workArea.Left, workArea.Right - effectiveWidth);
        var maxY = Math.Max(workArea.Top, workArea.Bottom - effectiveHeight);
        return new Point(
            Math.Clamp(location.X, workArea.Left, maxX),
            Math.Clamp(location.Y, workArea.Top, maxY));
    }

    private static long DistanceSquaredToRectangle(Point point, Rectangle rectangle)
    {
        var dx = point.X < rectangle.Left
            ? rectangle.Left - point.X
            : point.X >= rectangle.Right
                ? point.X - rectangle.Right + 1
                : 0;
        var dy = point.Y < rectangle.Top
            ? rectangle.Top - point.Y
            : point.Y >= rectangle.Bottom
                ? point.Y - rectangle.Bottom + 1
                : 0;
        return (long)dx * dx + (long)dy * dy;
    }
}
