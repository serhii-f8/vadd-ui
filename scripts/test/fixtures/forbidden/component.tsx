export const Bad = (props: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: props.html }} />
)
