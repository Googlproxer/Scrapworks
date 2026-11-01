// TypeScript members are public by default. Making that explicit is safe;
// choosing private or protected requires a deliberate design decision.
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { JSRuleDefinition, SourceCode } from 'eslint';

type AccessibilityRule = JSRuleDefinition<{
  MessageIds: 'missingAccessibility';
  RuleOptions: [];
}>;

// ESLint 10 removed legacy context methods still declared by typescript-eslint.
// Keep its current context API and add the parser's TypeScript token overloads.
type RuleContext = Omit<Parameters<AccessibilityRule['create']>[0], 'sourceCode'> & {
  readonly sourceCode: SourceCode & TSESLint.SourceCode;
};

type ClassMember =
  | TSESTree.MethodDefinition
  | TSESTree.PropertyDefinition
  | TSESTree.AccessorProperty
  | TSESTree.TSAbstractMethodDefinition
  | TSESTree.TSAbstractPropertyDefinition
  | TSESTree.TSAbstractAccessorProperty
  | TSESTree.TSParameterProperty;

const rule: AccessibilityRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require explicit class member accessibility except on constructors and auto-fix missing modifiers to public.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingAccessibility: 'Add an explicit access modifier. Formatting defaults to public.',
    },
  },
  create(context: RuleContext) {
    function checkMember(value: unknown): void {
      // ESLint's core visitor type covers JavaScript; our selectors below also
      // dispatch TypeScript-only members from the configured TypeScript parser.
      const node = value as ClassMember;

      // Constructors may omit a modifier; native #private members cannot have one.
      // Constructor parameter properties are checked separately.
      if (
        ('kind' in node && node.kind === 'constructor') ||
        node.accessibility ||
        ('key' in node && node.key.type === 'PrivateIdentifier')
      ) {
        return;
      }

      const lastDecorator = node.decorators?.at(-1);
      const firstToken = lastDecorator
        ? context.sourceCode.getTokenAfter(lastDecorator)
        : context.sourceCode.getFirstToken(node);

      if (!firstToken) return;

      context.report({
        loc: firstToken.loc,
        messageId: 'missingAccessibility',
        fix: (fixer) => fixer.insertTextBefore(firstToken, 'public '),
      });
    }

    return {
      'MethodDefinition, TSAbstractMethodDefinition': checkMember,
      'PropertyDefinition, TSAbstractPropertyDefinition, AccessorProperty, TSAbstractAccessorProperty':
        checkMember,
      TSParameterProperty: checkMember,
    };
  },
};

export default rule;
