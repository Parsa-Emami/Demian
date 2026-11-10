export default function setTouchInteractionLabel(element, action) {
    const label = action || 'تعامل';
    if (element && element.textContent !== label) element.textContent = label;
}
