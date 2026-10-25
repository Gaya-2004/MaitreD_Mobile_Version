import os
import re

app_dir = r"d:\TECH WIZARD FOLDER-INTERN\Restaurant-mobile\Frontend\src\app"

for filename in os.listdir(app_dir):
    if not filename.endswith(".tsx"):
        continue
        
    filepath = os.path.join(app_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    original_content = content
    
    # 1. Fix SafeAreaView import
    # Look for SafeAreaView in react-native import
    match = re.search(r"import\s+{([^}]*SafeAreaView[^}]*)}\s+from\s+['\"]react-native['\"]", content)
    if match:
        imports = match.group(1).split(',')
        new_imports = [i.strip() for i in imports if i.strip() != 'SafeAreaView']
        
        if new_imports:
            new_import_str = f"import {{ {', '.join(new_imports)} }} from 'react-native';"
        else:
            new_import_str = ""
            
        content = content.replace(match.group(0), new_import_str)
        
        # Add SafeAreaView to react-native-safe-area-context
        if "react-native-safe-area-context" in content:
            # If already imported, add to it
            context_match = re.search(r"import\s+{([^}]*)}\s+from\s+['\"]react-native-safe-area-context['\"]", content)
            if context_match and "SafeAreaView" not in context_match.group(1):
                new_context_imports = context_match.group(1).strip() + ", SafeAreaView"
                content = content.replace(context_match.group(0), f"import {{ {new_context_imports} }} from 'react-native-safe-area-context'")
        else:
            # Add new import after the react-native import
            if new_import_str:
                content = content.replace(new_import_str, f"{new_import_str}\nimport {{ SafeAreaView }} from 'react-native-safe-area-context';")
            else:
                # Fallback, just prepend
                content = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content

    # Special case for multiline imports
    multiline_match = re.search(r"import\s+{([\s\S]*?SafeAreaView[\s\S]*?)}\s+from\s+['\"]react-native['\"]", content)
    if multiline_match:
        imports = multiline_match.group(1).split(',')
        new_imports = [i.strip() for i in imports if i.strip() and i.strip() != 'SafeAreaView']
        new_import_str = "import {\n  " + ",\n  ".join(new_imports) + "\n} from 'react-native';"
        content = content.replace(multiline_match.group(0), new_import_str)
        if "react-native-safe-area-context" not in content:
            content = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content

    # 2. Silence the console.warn for AsyncStorage
    content = re.sub(r'console\.warn\("AsyncStorage\.getItem failed.*', r'// suppressed AsyncStorage warning', content)
    content = re.sub(r'console\.warn\(e\);\s*// AsyncStorage.*', r'// suppressed AsyncStorage warning', content)
    # Target simple console.warn(e) if it's inside a catch block right after AsyncStorage
    # We will just replace specific known warning strings
    
    if content != original_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {filename}")
        
print("Cleanup complete.")
